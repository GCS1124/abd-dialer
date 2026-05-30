import { cn } from "../../lib/utils";
import type { EmployeeActivityCalendarDay } from "../../lib/employeeActivityCalendar.ts";

interface CalendarDayCardProps {
  day: EmployeeActivityCalendarDay;
  isToday: boolean;
  isSelected: boolean;
  onClick: () => void;
}

function ActivityPill({
  label,
  tone,
  value,
}: {
  label: string;
  tone: string;
  value: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold",
        tone,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {value} {label}
    </span>
  );
}

export function CalendarDayCard({ day, isToday, isSelected, onClick }: CalendarDayCardProps) {
  const dayNumber = Number(day.date.slice(-2));
  const hasActivity = day.totalCalls > 0;
  const hasTimecard = day.timecardSummary.trackedDays > 0;
  const summaryLabel = hasActivity
    ? `${day.totalCalls} total call${day.totalCalls === 1 ? "" : "s"}, ${day.interested} interested, ${day.notInterested} not interested, ${day.disposedCompleted} disposed or completed, ${day.failed} failed or not connected`
    : hasTimecard
      ? "Timecard recorded"
      : "No activity";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${day.date}: ${summaryLabel}`}
      aria-pressed={isSelected}
      className={cn(
        "group flex min-h-[132px] flex-col rounded-[18px] border p-3 text-left transition-all",
        hasActivity
          ? "bg-white hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)] dark:bg-slate-950/90"
          : "bg-slate-50/70 dark:bg-slate-900/40",
        isSelected
          ? "border-sky-300 bg-sky-50 shadow-[0_12px_30px_rgba(14,165,233,0.12)] dark:border-sky-400/40 dark:bg-sky-950/20"
          : "border-slate-200 dark:border-slate-800",
        isToday ? "ring-2 ring-sky-200 ring-offset-1 ring-offset-transparent" : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Day
          </p>
          <p className="mt-1 text-[18px] font-semibold text-slate-900 dark:text-white">
            {dayNumber}
          </p>
        </div>

        <div className="text-right">
          <p
            className={cn(
              "text-[11px] font-medium",
              hasActivity
                ? "text-slate-600 dark:text-slate-300"
                : hasTimecard
                  ? "text-slate-600 dark:text-slate-300"
                  : "text-slate-400 dark:text-slate-500",
            )}
          >
            {hasActivity
              ? `${day.totalCalls} call${day.totalCalls === 1 ? "" : "s"}`
              : hasTimecard
                ? "Timecard logged"
                : "No activity"}
          </p>
          {day.averageDurationSeconds > 0 ? (
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              Avg {day.averageDuration}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {day.interested ? (
          <ActivityPill label="Interested" tone="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" value={day.interested} />
        ) : null}
        {day.notInterested ? (
          <ActivityPill label="Not interested" tone="bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" value={day.notInterested} />
        ) : null}
        {day.disposedCompleted ? (
          <ActivityPill label="Completed" tone="bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" value={day.disposedCompleted} />
        ) : null}
        {day.failed ? (
          <ActivityPill label="Failed" tone="bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300" value={day.failed} />
        ) : null}
      </div>

      <div className="mt-auto pt-3">
        {hasActivity ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {day.records.length} detailed record{day.records.length === 1 ? "" : "s"}
          </p>
        ) : hasTimecard ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Timecard recorded
          </p>
        ) : (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">No activity</p>
        )}
      </div>
    </button>
  );
}
