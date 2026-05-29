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
import { getTimeTrackingPanelState } from "../lib/timeTracking";
import { formatDateTime, formatDuration, getInsightTone } from "../lib/utils";

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
  const isAgent = currentUser.role === "agent";
  const agentMetrics = analytics.agentMetrics;
  const adminMetrics = analytics.adminMetrics;
  const allCalls = leads
    .flatMap((lead) => lead.callHistory)
    .filter((call) => call.source !== "failed_attempt" && call.status !== "failed");
  const scopedLeads = isAgent ? leads.filter((lead) => lead.assignedAgentId === currentUser.id) : leads;
  const scopedCalls = isAgent ? allCalls.filter((call) => call.agentId === currentUser.id) : allCalls;
  const hasWorkspaceData = scopedLeads.length > 0 || scopedCalls.length > 0;
  const timeTrackingPanel = getTimeTrackingPanelState(timeTracking, nowIso);
  const activityScopeLabel = isAgent ? "My activity" : "Live feed";
  const activityEmptyLabel = isAgent
    ? "Activity will appear here as your calls, notes, and callbacks are logged."
    : "Activity will appear here as calls, notes, and callbacks are logged.";
  const dashboardTitle = isAgent ? "My activity at a glance" : "Team productivity at a glance";
  const performanceLabel = isAgent ? "My performance" : "Daily Performance";
  const dispositionLabel = isAgent ? "My main disposition mix" : "Main disposition mix";
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

  const todayCalls = scopedCalls.filter((call) => new Date(call.createdAt) >= startOfToday).length;
  const weekCalls = scopedCalls.filter((call) => new Date(call.createdAt) >= startOfWeek).length;
  const monthCalls = scopedCalls.filter((call) => new Date(call.createdAt) >= startOfMonth).length;

  const averageDurationValue =
    (isAgent ? agentMetrics?.averageCallDuration : adminMetrics?.averageCallDuration) ??
    (scopedCalls.length
      ? Math.round(
          scopedCalls.reduce((total, call) => total + call.durationSeconds, 0) / scopedCalls.length,
        )
      : 0);

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

      {isAgent ? (
        <div className="grid gap-4 md:grid-cols-3">
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
      ) : null}

      {!isAgent && !hasWorkspaceData ? (
        <EmptyState
          icon={Users2}
          title={workspaceLoading ? "Loading workspace" : "No CRM activity yet"}
          description={
            workspaceLoading
              ? "The dashboard is waiting for the latest CRM data."
              : isAgent
                ? "Assigned leads and call activity will appear here once the queue is populated."
                : "Import leads and assign them to agents to start generating call and follow-up metrics."
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
            <PerformanceChart data={analytics.performanceData} />
          </div>
        </Card>

        <Card className="p-5">
          <p className="crm-section-label">{dispositionLabel}</p>
          <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
            Main disposition mix
          </h3>
          <div className="mt-5">
            <BreakdownDonutChart data={analytics.mainDispositionData} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="crm-section-label">
                Recent CRM Activity
              </p>
              <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
                Latest movement
              </h3>
            </div>
            <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {activityScopeLabel}
            </Badge>
          </div>
          <div className="mt-5 space-y-3">
            {analytics.activityFeed.length ? (
              analytics.activityFeed.map((activity) => (
                <div
                  key={activity.id}
                  className="crm-subtle-card px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {activity.title}
                      </p>
                      <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
                        {activity.leadName} | {activity.actorName === currentUser.name ? "You" : activity.actorName}
                      </p>
                      <p className="mt-2 text-[12px] leading-5 text-slate-600 dark:text-slate-300">
                        {activity.description || "Activity logged on this lead."}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {formatDateTime(activity.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[12px] text-slate-500 dark:text-slate-400">
                {activityEmptyLabel}
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
