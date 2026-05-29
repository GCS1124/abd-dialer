import { useEffect, useState } from "react";
import { AlarmClock, Clock3, PhoneCall, Users2 } from "lucide-react";

import { BreakdownDonutChart } from "../components/charts/BreakdownDonutChart";
import { PerformanceChart } from "../components/charts/PerformanceChart";
import { Badge } from "../components/shared/Badge";
import { Card } from "../components/shared/Card";
import { EmptyState } from "../components/shared/EmptyState";
import { MetricCard } from "../components/shared/MetricCard";
import { PageHeader } from "../components/shared/PageHeader";
import { useAppState } from "../hooks/useAppState";
import { getDailyPerformance, getMainDispositionBreakdown } from "../lib/analytics";
import { getTimeTrackingPanelState } from "../lib/timeTracking";
import { formatDuration, getInsightTone } from "../lib/utils";

export function DashboardPage() {
  const { currentUser, leads, analytics, workspaceLoading, timeTracking } = useAppState();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  if (!currentUser) {
    return null;
  }

  const now = new Date(nowMs);
  const nowIso = now.toISOString();
  const userScopedCalls = leads
    .flatMap((lead) => lead.callHistory)
    .filter(
      (call) =>
        call.agentId === currentUser.id &&
        call.source !== "failed_attempt" &&
        call.status !== "failed",
    );
  const userScopedLeads = leads.filter((lead) => lead.assignedAgentId === currentUser.id);
  const hasWorkspaceData = userScopedLeads.length > 0 || userScopedCalls.length > 0;
  const timeTrackingPanel = getTimeTrackingPanelState(timeTracking, nowIso);
  const dashboardTitle = "My activity at a glance";
  const performanceLabel = "My performance";
  const dispositionLabel = "My main disposition mix";
  const timeSummaryCards = [
    {
      label: "Time on\nsystem",
      value: timeTrackingPanel.timeOnSystemLabel,
      accent: "border-sky-100 bg-sky-50/70 dark:border-sky-900/40 dark:bg-sky-950/20",
      labelTone: "text-sky-600 dark:text-sky-300",
    },
    {
      label: "Break\ntime",
      value: timeTrackingPanel.totalBreakTimeLabel,
      accent: "border-amber-100 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20",
      labelTone: "text-amber-600 dark:text-amber-300",
    },
    {
      label: "Total\nwrap",
      value: timeTrackingPanel.totalWrapUpLabel,
      accent: "border-violet-100 bg-violet-50/70 dark:border-violet-900/40 dark:bg-violet-950/20",
      labelTone: "text-violet-600 dark:text-violet-300",
    },
    {
      label: "Login\nhours",
      value: timeTrackingPanel.totalLoginHoursLabel,
      accent: "border-emerald-100 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-950/20",
      labelTone: "text-emerald-600 dark:text-emerald-300",
    },
  ];

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const todayCalls = userScopedCalls.filter((call) => new Date(call.createdAt) >= startOfToday).length;
  const weekCalls = userScopedCalls.filter((call) => new Date(call.createdAt) >= startOfWeek).length;
  const monthCalls = userScopedCalls.filter((call) => new Date(call.createdAt) >= startOfMonth).length;

  const averageDurationValue = userScopedCalls.length
    ? Math.round(
        userScopedCalls.reduce((total, call) => total + call.durationSeconds, 0) /
          userScopedCalls.length,
      )
    : 0;
  const performanceData = getDailyPerformance(leads, currentUser.id);
  const mainDispositionData = getMainDispositionBreakdown(leads, currentUser.id);

  const visibleFocusMetrics = analytics.focusMetrics.filter((metric) => metric.label !== "Hot leads");
  const focusGridColumns =
    visibleFocusMetrics.length >= 4
      ? "xl:grid-cols-4"
      : visibleFocusMetrics.length === 3
        ? "xl:grid-cols-3"
        : "xl:grid-cols-2";

  return (
    <div className="space-y-5">
      <PageHeader title={dashboardTitle} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {timeSummaryCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-[28px] border px-5 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] ${card.accent}`}
          >
            <div className="flex h-full min-h-[7rem] flex-col justify-between gap-6">
              <p
                className={`whitespace-pre-line text-[10px] font-semibold uppercase tracking-[0.24em] ${card.labelTone}`}
              >
                {card.label}
              </p>
              <p className="text-[32px] font-semibold leading-none tracking-tight text-slate-950 dark:text-white">
                {card.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {!hasWorkspaceData ? (
        <EmptyState
          icon={Users2}
          title={workspaceLoading ? "Loading workspace" : "No CRM activity yet"}
          description={
            workspaceLoading
              ? "The dashboard is waiting for the latest CRM data."
              : "Your calls, notes, callbacks, and dispositions will appear here once activity is logged."
          }
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Today", value: String(todayCalls), icon: PhoneCall },
          { label: "This week", value: String(weekCalls), icon: Users2 },
          { label: "This month", value: String(monthCalls), icon: AlarmClock },
          { label: "Average duration", value: formatDuration(averageDurationValue), icon: Clock3 },
        ].map((item) => (
          <MetricCard
            key={item.label}
            label={item.label}
            value={item.value}
            icon={item.icon}
          />
        ))}
      </div>

      <div className={`grid gap-3 md:grid-cols-2 ${focusGridColumns}`}>
        {visibleFocusMetrics.map((metric) => (
          <MetricCard
            key={metric.id}
            label={metric.label}
            value={metric.value}
            hint={metric.hint}
            className="p-4"
            valueClassName="mt-3 text-[26px]"
            action={
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${getInsightTone(metric.tone)}`}
              >
                Focus
              </span>
            }
          />
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="crm-section-label">{performanceLabel}</p>
              <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
                Calls vs connected
              </h3>
            </div>
            <Badge className="bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
              Last 7 days
            </Badge>
          </div>
          <div className="mt-6">
            <PerformanceChart data={performanceData} />
          </div>
        </Card>

        <Card className="p-5">
          <p className="crm-section-label">{dispositionLabel}</p>
          <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
            Main disposition mix
          </h3>
          <div className="mt-5">
            <BreakdownDonutChart data={mainDispositionData} />
          </div>
        </Card>
      </div>

    </div>
  );
}
