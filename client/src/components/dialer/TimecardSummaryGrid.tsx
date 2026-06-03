import type { EmployeeTimecardSummary } from "../../types";
import { cn } from "../../lib/utils";
import { formatTimecardDuration } from "../../lib/timecards.ts";

interface TimecardSummaryGridProps {
  summary: EmployeeTimecardSummary;
  variant: "month" | "day";
  className?: string;
}

function getMetricValue(summary: EmployeeTimecardSummary, variant: "month" | "day", field: "login" | "break" | "wrap" | "system") {
  if (summary.trackedDays === 0) {
    return "--";
  }

  const valueSeconds = variant === "month"
    ? {
        login: summary.averageLoginHoursSeconds,
        break: summary.averageBreakSeconds,
        wrap: summary.averageWrapSeconds,
        system: summary.averageTimeOnSystemSeconds,
      }[field]
    : {
        login: summary.totalLoginHoursSeconds,
        break: summary.totalBreakSeconds,
        wrap: summary.totalWrapSeconds,
        system: summary.totalTimeOnSystemSeconds,
      }[field];

  return formatTimecardDuration(valueSeconds);
}

function getCaption(summary: EmployeeTimecardSummary, variant: "month" | "day") {
  if (summary.trackedDays === 0) {
    return variant === "month"
      ? "No tracked timecards yet."
      : "No stored timecard for this day yet.";
  }

  if (variant === "month") {
    return `Average across ${summary.trackedDays} tracked day${summary.trackedDays === 1 ? "" : "s"}.`;
  }

  return "Daily totals stored in Supabase.";
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.02)] dark:border-slate-800 dark:bg-slate-950">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 text-[18px] font-semibold tracking-tight text-slate-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

export function TimecardSummaryGrid({
  summary,
  variant,
  className,
}: TimecardSummaryGridProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          Timecards
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {getCaption(summary, variant)}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <MetricCard
          label="Total hours"
          value={getMetricValue(summary, variant, "login")}
        />
        <MetricCard
          label="Breaks"
          value={getMetricValue(summary, variant, "break")}
        />
        <MetricCard
          label="Wrap time"
          value={getMetricValue(summary, variant, "wrap")}
        />
        <MetricCard
          label="Productive hours"
          value={getMetricValue(summary, variant, "system")}
        />
      </div>
    </div>
  );
}
