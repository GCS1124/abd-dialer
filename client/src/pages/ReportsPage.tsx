import { useEffect, useState } from "react";

import { Badge } from "../components/shared/Badge";
import { Card } from "../components/shared/Card";
import { Button } from "../components/shared/Button";
import { MetricCard } from "../components/shared/MetricCard";
import { PageHeader } from "../components/shared/PageHeader";
import { ChartTooltip } from "../components/charts/ChartTooltip";
import { EmployeeActivityCalendar } from "../components/dialer/EmployeeActivityCalendar";
import { BreakdownDonutChart } from "../components/charts/BreakdownDonutChart";
import { PerformanceChart } from "../components/charts/PerformanceChart";
import { PipelineBarChart } from "../components/charts/PipelineBarChart";
import { useAppState } from "../hooks/useAppState";
import type { EmployeeActivityCalendarResponse } from "../lib/employeeActivityCalendar";
import { formatTimecardDuration } from "../lib/timecards";
import { formatDuration } from "../lib/utils";
import { calculateLeadConversionRate } from "../lib/reports";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { utils, writeFile } from "xlsx";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const numberFormatter = new Intl.NumberFormat("en");
const percentFormatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
});

const callLeadColors = {
  totalCalls: "#38bdf8",
  totalConnect: "#fbbf24",
  totalLeads: "#22c55e",
};

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function monthKeyForDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function monthLabelForDate(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(date);
}

interface AgentTimecardStats {
  totalLoginHoursSeconds: number;
  weeklyAverageLoginHoursSeconds: number;
  averageWrapSeconds: number;
  wrapTimePercent: number;
}

function formatPercent(value: number) {
  return `${percentFormatter.format(value)}%`;
}

function getWeekStartKey(dateKey: string) {
  const [yearText, monthText, dayText] = dateKey.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const day = Number(dayText);

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) {
    return dateKey;
  }

  const date = new Date(Date.UTC(year, monthIndex, day));
  const dayOfWeek = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 1);
  return date.toISOString().slice(0, 10);
}

function summarizeAgentTimecardStats(calendar: EmployeeActivityCalendarResponse): AgentTimecardStats {
  const totalLoginHoursSeconds = calendar.monthTimecardSummary.totalLoginHoursSeconds;
  const weeksInMonth = new Set(calendar.days.map((day) => getWeekStartKey(day.date))).size;
  const weeklyAverageLoginHoursSeconds =
    weeksInMonth > 0 ? Math.round(totalLoginHoursSeconds / weeksInMonth) : 0;
  const averageWrapSeconds = calendar.monthTimecardSummary.averageWrapSeconds;
  const wrapTimePercent =
    totalLoginHoursSeconds > 0
      ? (calendar.monthTimecardSummary.totalWrapSeconds / totalLoginHoursSeconds) * 100
      : 0;

  return {
    totalLoginHoursSeconds,
    weeklyAverageLoginHoursSeconds,
    averageWrapSeconds,
    wrapTimePercent,
  };
}

function getAgentTimecardWorkbookFilename(monthLabel: string) {
  const safeLabel = monthLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `agent-wise-performance-${safeLabel || "report"}.xlsx`;
}

function CallLeadPerformanceCard({
  totalCalls,
  totalConnect,
  totalLeads,
  conversionRate,
}: {
  totalCalls: number;
  totalConnect: number;
  totalLeads: number;
  conversionRate: number;
}) {
  const chartData = [
    { label: "Total Calls", value: totalCalls, color: callLeadColors.totalCalls },
    { label: "Total Connect", value: totalConnect, color: callLeadColors.totalConnect },
    { label: "Total Leads", value: totalLeads, color: callLeadColors.totalLeads },
  ];

  const legendItems = [
    {
      label: "Blue - Total Calls",
      description: "Represents total outbound/team calls.",
      value: totalCalls,
      color: callLeadColors.totalCalls,
    },
    {
      label: "Yellow - Total Connect",
      description: "Represents connected calls.",
      value: totalConnect,
      color: callLeadColors.totalConnect,
    },
    {
      label: "Green - Total Leads",
      description: "Represents generated leads.",
      value: totalLeads,
      color: callLeadColors.totalLeads,
    },
  ];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="crm-section-label">Outbound Performance</p>
          <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
            Call &amp; Lead Performance
          </h3>
          <p className="mt-2 text-[13px] leading-6 text-slate-500 dark:text-slate-400">
            Track connected calls, total leads, and the resulting conversion rate in one view.
          </p>
        </div>

        <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
          Connected vs Leads
        </Badge>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <div className="crm-subtle-card flex min-h-[320px] flex-col justify-between gap-4 px-4 py-5 dark:bg-slate-950/50">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">
                Lead conversion
              </p>
              <p className="mt-3 text-[clamp(2rem,3vw,3.5rem)] font-semibold tracking-tight leading-none text-slate-950 dark:text-white">
                {formatPercent(conversionRate)}
              </p>
              <p className="mt-2 max-w-[32rem] text-[12px] leading-5 text-slate-500 dark:text-slate-400">
                Conversion rate = total connected calls divided by total leads.
              </p>
            </div>

            <div className="rounded-full border border-sky-200/80 bg-sky-50 px-3 py-2 text-right text-[11px] font-medium text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300">
              {numberFormatter.format(totalConnect)} connected calls out of{" "}
              {numberFormatter.format(totalLeads)} total leads
            </div>
          </div>

          <div className="h-[248px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(15,23,42,0.05)" }} />
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={80}
                  outerRadius={112}
                  paddingAngle={5}
                  stroke="rgba(255,255,255,0.95)"
                  strokeWidth={4}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.label} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4">
          <div className="crm-subtle-card border-sky-200/80 bg-sky-50/70 px-4 py-4 dark:border-sky-900/40 dark:bg-sky-950/20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700 dark:text-sky-300">
              Connected vs Leads
            </p>
            <div className="mt-3 flex items-end gap-3">
              <p className="text-[34px] font-semibold tracking-tight text-slate-950 dark:text-white">
                {formatPercent(conversionRate)}
              </p>
              <span className="mb-2 rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                Lead Conversion
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
              Conversion rate = total connected calls divided by total leads.
            </p>
          </div>

          <div className="space-y-3">
            {legendItems.map((item) => (
              <div
                key={item.label}
                className="crm-subtle-card flex items-center justify-between gap-3 px-4 py-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3.5 w-3.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <p className="truncate text-[12px] font-medium text-slate-900 dark:text-white">
                      {item.label}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                    {item.description}
                  </p>
                </div>
                <p className="shrink-0 text-[22px] font-semibold tracking-tight text-slate-950 dark:text-white">
                  {numberFormatter.format(item.value)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ReportsPage() {
  const { analytics, users, fetchEmployeeActivityCalendar } = useAppState();
  const metrics = analytics.adminMetrics;
  const totalLeads = analytics.statusData.reduce((sum, item) => sum + item.value, 0);
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [agentTimecardStats, setAgentTimecardStats] = useState<Record<string, AgentTimecardStats>>(
    {},
  );
  const [agentTimecardLoading, setAgentTimecardLoading] = useState(false);
  const monthKey = monthKeyForDate(monthCursor);
  const monthLabel = monthLabelForDate(monthCursor);

  useEffect(() => {
    let active = true;

    async function loadAgentTimecardStats() {
      if (!analytics.topAgents.length) {
        setAgentTimecardStats({});
        setAgentTimecardLoading(false);
        return;
      }

      setAgentTimecardLoading(true);
      const entries = await Promise.all(
        analytics.topAgents.map(async (agent) => {
          try {
            const calendar = await fetchEmployeeActivityCalendar(agent.id, monthKey);
            return [agent.id, summarizeAgentTimecardStats(calendar)] as const;
          } catch {
            return [agent.id, null] as const;
          }
        }),
      );

      if (!active) {
        return;
      }

      setAgentTimecardStats(
        Object.fromEntries(entries.filter((entry) => entry[1])) as Record<string, AgentTimecardStats>,
      );
      setAgentTimecardLoading(false);
    }

    void loadAgentTimecardStats();

    return () => {
      active = false;
    };
  }, [analytics.topAgents, fetchEmployeeActivityCalendar, monthKey]);

  const exportAgentTimecardExcel = async () => {
    const rows = analytics.topAgents.map((agent) => {
      const stats = agentTimecardStats[agent.id];
      return {
        Month: monthLabel,
        Agent: agent.name,
        Role: agent.role.replace("_", " "),
        Calls: agent.calls,
        Conversions: agent.conversions,
        "Callback completion": `${agent.callbackCompletionRate}%`,
        "Login hours": stats ? formatTimecardDuration(stats.totalLoginHoursSeconds) : "--",
        "Weekly login avg": stats
          ? formatTimecardDuration(stats.weeklyAverageLoginHoursSeconds)
          : "--",
        "Average wrap time": stats ? formatTimecardDuration(stats.averageWrapSeconds) : "--",
        "Wrap time %": stats ? `${formatPercent(stats.wrapTimePercent)}` : "--",
      };
    });

    const workbook = utils.book_new();
    const worksheet = utils.json_to_sheet(rows);
    utils.book_append_sheet(workbook, worksheet, "Agent Performance");
    writeFile(workbook, getAgentTimecardWorkbookFilename(monthLabel));
  };

  if (!metrics) {
    return null;
  }
  const conversionRate = calculateLeadConversionRate(metrics.connectedCalls, totalLeads);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Outbound performance reporting"
        description="Team calls, outcomes, pipeline health, and employee activity."
        actions={
          <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Manager view
          </Badge>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total team calls" value={metrics.totalTeamCalls} />
        <MetricCard label="Connected calls" value={metrics.connectedCalls} />
        <MetricCard label="Callback completion" value={`${metrics.callbackCompletionRate}%`} />
        <MetricCard label="Average duration" value={formatDuration(metrics.averageCallDuration)} />
      </div>

      <CallLeadPerformanceCard
        totalCalls={metrics.totalTeamCalls}
        totalConnect={metrics.connectedCalls}
        totalLeads={totalLeads}
        conversionRate={conversionRate}
      />

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.95fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="crm-section-label">
                Daily Productivity
              </p>
              <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
                Calls by day
              </h3>
            </div>
            <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Team-wide
            </Badge>
          </div>
          <div className="mt-6">
            <PerformanceChart data={analytics.performanceData} />
          </div>
        </Card>

        <Card className="p-5">
          <p className="crm-section-label">
            Disposition Breakdown
          </p>
          <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
            Outcome mix
          </h3>
          <div className="mt-5">
            <BreakdownDonutChart data={analytics.dispositionData} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-5">
          <p className="crm-section-label">
            Lead Status Distribution
          </p>
          <div className="mt-5 space-y-3">
            {analytics.statusData.map((item) => (
              <div
                key={item.label}
                className="crm-subtle-card flex items-center justify-between px-4 py-4"
              >
                <p className="text-[12px] font-medium capitalize text-slate-700 dark:text-slate-200">
                  {item.label.replace("_", " ")}
                </p>
                <p className="text-[24px] font-semibold text-slate-900 dark:text-white">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <p className="crm-section-label">
            Pipeline Overview
          </p>
          <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
            Pipeline
          </h3>
          <div className="mt-5">
            <PipelineBarChart data={analytics.pipelineData} />
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <p className="crm-section-label">
          Agent-wise performance
        </p>
        <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
          Top performing agents
        </h3>
        <div className="mt-5 flex flex-col gap-3 rounded-[18px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Month
            </p>
            <p className="mt-1 text-[18px] font-semibold text-slate-900 dark:text-white">
              {monthLabel}
            </p>
            <p className="mt-1 text-[12px] leading-5 text-slate-500 dark:text-slate-400">
              Monthly login hours, weekly averages, and wrap-time metrics follow this month.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
              }
              aria-label="Previous month"
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setMonthCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
              }
              aria-label="Next month"
            >
              <ChevronRight size={14} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={exportAgentTimecardExcel}
              disabled={agentTimecardLoading || !analytics.topAgents.length}
            >
              Export Excel
            </Button>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="crm-table">
            <thead>
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Calls</th>
                <th className="px-4 py-3">Conversions</th>
                <th className="px-4 py-3">Callback completion</th>
                <th className="px-4 py-3">Login hours</th>
                <th className="px-4 py-3">Wrap time</th>
              </tr>
            </thead>
            <tbody>
              {analytics.topAgents.map((agent) => (
                <tr
                  key={agent.id}
                  className="border-t border-slate-200/80 dark:border-slate-800"
                >
                  <td className="px-4 py-4">
                    <p className="font-semibold text-slate-900 dark:text-white">{agent.name}</p>
                    <p className="text-slate-500 dark:text-slate-400">{agent.role}</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{agent.calls}</td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    {agent.conversions}
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    {agent.callbackCompletionRate}%
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    {agentTimecardStats[agent.id] ? (
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {formatTimecardDuration(
                            agentTimecardStats[agent.id].totalLoginHoursSeconds,
                          )}
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                          Weekly avg{" "}
                          {formatTimecardDuration(
                            agentTimecardStats[agent.id].weeklyAverageLoginHoursSeconds,
                          )}
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">--</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                    {agentTimecardStats[agent.id] ? (
                      <div>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {formatTimecardDuration(agentTimecardStats[agent.id].averageWrapSeconds)}
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                          {formatPercent(agentTimecardStats[agent.id].wrapTimePercent)} of login
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">--</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="crm-section-label">
              Employee activity
            </p>
            <h3 className="mt-2 text-[20px] font-semibold text-slate-900 dark:text-white">
              Monthly activity by employee
            </h3>
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-500 dark:text-slate-400">
              Search a team member, switch the month, and drill into each day&apos;s call outcomes.
            </p>
          </div>
          <Badge className="bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
            Live report
          </Badge>
        </div>

        <EmployeeActivityCalendar
          employees={users}
          loadCalendar={fetchEmployeeActivityCalendar}
        />
      </div>
    </div>
  );
}
