import { ChevronLeft, ChevronRight, Search, Users2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  EmployeeActivityCalendarDay,
  EmployeeActivityCalendarRecord,
  EmployeeActivityCalendarResponse,
} from "../../lib/employeeActivityCalendar.ts";
import { cn, formatDuration } from "../../lib/utils";
import { AlertBanner } from "../shared/AlertBanner";
import { Button } from "../shared/Button";
import { Card } from "../shared/Card";
import { EmptyState } from "../shared/EmptyState";
import { CalendarDayCard } from "./CalendarDayCard";
import { ActivityDetailsModal } from "./ActivityDetailsModal";
import { StatusLegend } from "./StatusLegend";
import type { User } from "../../types";

type CalendarStatusFilter =
  | "all"
  | "interested"
  | "not_interested"
  | "disposed_completed"
  | "failed";

const filterOptions: Array<{ value: CalendarStatusFilter; label: string }> = [
  { value: "all", label: "All outcomes" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Not Interested" },
  { value: "disposed_completed", label: "Disposed / Completed" },
  { value: "failed", label: "Failed / Not connected" },
];

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function monthKeyForDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function monthLabelForDate(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(date);
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isInterestedRecord(record: EmployeeActivityCalendarRecord) {
  return record.disposition === "Interested";
}

function isNotInterestedRecord(record: EmployeeActivityCalendarRecord) {
  return record.disposition === "Not Interested";
}

function isCompletedRecord(record: EmployeeActivityCalendarRecord) {
  return record.disposition === "Appointment Booked" || record.disposition === "Sale Closed";
}

function isFailedRecord(record: EmployeeActivityCalendarRecord) {
  return (
    record.callStatus === "failed" ||
    record.callStatus === "missed" ||
    ["No Answer", "Busy", "Voicemail", "Wrong Number", "Failed Attempt"].includes(
      record.disposition,
    )
  );
}

function recordMatchesFilter(record: EmployeeActivityCalendarRecord, filter: CalendarStatusFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "interested") {
    return isInterestedRecord(record);
  }

  if (filter === "not_interested") {
    return isNotInterestedRecord(record);
  }

  if (filter === "disposed_completed") {
    return isCompletedRecord(record);
  }

  return isFailedRecord(record);
}

function summarizeDay(day: EmployeeActivityCalendarDay, records: EmployeeActivityCalendarRecord[]) {
  const totalTalkTimeSeconds = records.reduce((sum, record) => sum + record.durationSeconds, 0);
  const averageDurationSeconds = records.length ? Math.round(totalTalkTimeSeconds / records.length) : 0;

  return {
    ...day,
    totalCalls: records.length,
    connectedCalls: records.filter((record) => record.callStatus === "connected").length,
    interested: records.filter(isInterestedRecord).length,
    notInterested: records.filter(isNotInterestedRecord).length,
    disposedCompleted: records.filter(isCompletedRecord).length,
    failed: records.filter(isFailedRecord).length,
    totalTalkTimeSeconds,
    averageDurationSeconds,
    averageDuration: formatDuration(averageDurationSeconds),
    records,
  };
}

function applyFilter(
  calendar: EmployeeActivityCalendarResponse | null,
  filter: CalendarStatusFilter,
) {
  if (!calendar || filter === "all") {
    return calendar;
  }

  return {
    ...calendar,
    days: calendar.days.map((day) => summarizeDay(day, day.records.filter((record) => recordMatchesFilter(record, filter)))),
  };
}

function employeeSearchText(user: User) {
  return [user.name, user.team, user.title, user.email].join(" ").toLowerCase();
}

function getMonthGridStart(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = start.getDay();
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - offset);
  return gridStart;
}

function LoadingGrid() {
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-7">
      {Array.from({ length: 14 }, (_, index) => (
        <div
          key={index}
          className="min-h-[132px] animate-pulse rounded-[18px] border border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/40"
        />
      ))}
    </div>
  );
}

interface EmployeeActivityCalendarProps {
  employees: User[];
  loadCalendar: (employeeId: string, month: string) => Promise<EmployeeActivityCalendarResponse>;
}

export function EmployeeActivityCalendar({ employees, loadCalendar }: EmployeeActivityCalendarProps) {
  const [search, setSearch] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [monthCursor, setMonthCursor] = useState(() => new Date());
  const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>("all");
  const [calendar, setCalendar] = useState<EmployeeActivityCalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [reloadCounter, setReloadCounter] = useState(0);

  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...employees]
      .filter((employee) => employee.role !== "admin")
      .sort((left, right) => left.name.localeCompare(right.name))
      .filter((employee) => (query ? employeeSearchText(employee).includes(query) : true));
  }, [employees, search]);

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId],
  );
  const monthKey = useMemo(() => monthKeyForDate(monthCursor), [monthCursor]);
  const monthLabel = useMemo(() => monthLabelForDate(monthCursor), [monthCursor]);
  const filteredCalendar = useMemo(
    () => applyFilter(calendar, statusFilter),
    [calendar, statusFilter],
  );
  const selectedFilterLabel = filterOptions.find((item) => item.value === statusFilter)?.label ?? "All outcomes";
  const hasMonthActivity = calendar?.days.some((day) => day.totalCalls > 0) ?? false;
  const hasVisibleActivity = filteredCalendar?.days.some((day) => day.totalCalls > 0) ?? false;
  const selectedDay =
    filteredCalendar?.days.find((day) => day.date === selectedDate) ?? null;
  const leadingBlankCount = getMonthGridStart(monthCursor).getDay();
  const totalCalendarDays = filteredCalendar?.days.length ?? new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
  const monthGridCells = leadingBlankCount + totalCalendarDays;
  const trailingBlankCount = (7 - (monthGridCells % 7)) % 7;

  useEffect(() => {
    if (!selectedEmployeeId) {
      setCalendar(null);
      setLoading(false);
      setError("");
      setSelectedDate("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    setSelectedDate("");

    void loadCalendar(selectedEmployeeId, monthKey)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setCalendar(response);
      })
      .catch((fetchError) => {
        if (cancelled) {
          return;
        }

        setCalendar(null);
        setError(fetchError instanceof Error ? fetchError.message : "Unable to load calendar activity.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadCalendar, monthKey, reloadCounter, selectedEmployeeId]);

  const selectEmployee = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setSearch("");
    setSelectedDate("");
  };

  const retryLoad = () => {
    setReloadCounter((value) => value + 1);
  };

  const openDay = (date: string) => {
    setSelectedDate(date);
  };

  const closeDetails = () => {
    setSelectedDate("");
  };

  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="crm-section-label">Employee Calendar</p>
            {selectedEmployee ? (
              <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                {selectedEmployee.name}
              </span>
            ) : null}
          </div>
          <h3 className="text-[20px] font-semibold text-slate-900 dark:text-white">
            Monthly activity by employee
          </h3>
          <p className="max-w-2xl text-[13px] leading-6 text-slate-500 dark:text-slate-400">
            Search an employee, pick a month, and review day-wise call outcomes with status-colored indicators and a drill-down for each date.
          </p>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="space-y-3">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search employee by name, team, or title"
                  className="crm-input py-3 pl-10"
                />
              </div>

              <div className="max-h-64 overflow-y-auto rounded-[18px] border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                {visibleEmployees.length ? (
                  visibleEmployees.map((employee) => {
                    const isSelected = employee.id === selectedEmployeeId;
                    return (
                      <button
                        key={employee.id}
                        type="button"
                        onClick={() => selectEmployee(employee.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-[14px] border px-3 py-3 text-left transition",
                          isSelected
                            ? "border-sky-300 bg-sky-50 dark:border-sky-400/40 dark:bg-sky-950/20"
                            : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-slate-800 dark:hover:bg-slate-900/60",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">
                            {employee.name}
                          </p>
                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {employee.team} · {employee.title}
                          </p>
                        </div>

                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {employee.role.replace("_", " ")}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-[14px] border border-dashed border-slate-200 px-4 py-8 text-center text-[12px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    No employees match your search.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-[18px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Month
                  </p>
                  <p className="mt-1 text-[18px] font-semibold text-slate-900 dark:text-white">
                    {monthLabel}
                  </p>
                </div>

                <div className="flex items-center gap-2">
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
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Filter
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {filterOptions.map((option) => {
                    const active = statusFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setStatusFilter(option.value)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-[11px] font-medium transition",
                          active
                            ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400/40 dark:bg-sky-950/20 dark:text-sky-300"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedEmployee ? (
                <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-white">
                        {selectedEmployee.name}
                      </p>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {selectedEmployee.team} · {selectedEmployee.title}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedEmployeeId("");
                        setCalendar(null);
                        setSelectedDate("");
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-[12px] leading-6 text-slate-500 dark:text-slate-400">
                  Please select an employee to view calendar activity.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <StatusLegend />

      {!selectedEmployee ? (
        <EmptyState
          icon={Users2}
          title="Please select an employee to view calendar activity."
          description="Use the employee search above to load the monthly call calendar."
        />
      ) : loading ? (
        <Card className="space-y-4 p-5">
          <div>
            <p className="crm-section-label">Loading</p>
            <h3 className="mt-2 text-[16px] font-semibold text-slate-900 dark:text-white">
              Loading {selectedEmployee.name}'s {monthLabel} activity
            </h3>
          </div>
          <LoadingGrid />
        </Card>
      ) : error ? (
        <AlertBanner
          title="Unable to load employee activity"
          description={error}
          tone="error"
          action={
            <Button size="sm" variant="secondary" onClick={retryLoad}>
              Retry
            </Button>
          }
        />
      ) : calendar && !hasMonthActivity ? (
        <EmptyState
          icon={Users2}
          title="No call activity found for this month."
          description={`${selectedEmployee.name} has no call records in ${monthLabel}.`}
        />
      ) : calendar && !hasVisibleActivity ? (
        <EmptyState
          icon={Users2}
          title="No call activity matches the selected filter."
          description="Try a different status filter to view matching records for this month."
        />
      ) : filteredCalendar ? (
        <div className="space-y-4">
          <div className="grid grid-cols-7 gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
              <div key={weekday} className="px-2 py-1">
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: leadingBlankCount }, (_, index) => (
              <div
                key={`leading-${index}`}
                className="min-h-[132px] rounded-[18px] border border-dashed border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40"
              />
            ))}
            {filteredCalendar.days.map((day) => (
              <CalendarDayCard
                key={day.date}
                day={day}
                isToday={day.date === localDateKey(new Date())}
                isSelected={day.date === selectedDate}
                onClick={() => openDay(day.date)}
              />
            ))}
            {Array.from({ length: trailingBlankCount }, (_, index) => (
              <div
                key={`trailing-${index}`}
                className="min-h-[132px] rounded-[18px] border border-dashed border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/40"
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-[12px] text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
            <p>
              Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{selectedFilterLabel}</span> for {selectedEmployee.name}.
            </p>
            <p>
              Click a day to review the detailed call log.
            </p>
          </div>
        </div>
      ) : null}

      <ActivityDetailsModal
        open={Boolean(selectedDay)}
        employeeName={selectedEmployee?.name ?? ""}
        day={selectedDay}
        monthLabel={monthLabel}
        filterLabel={selectedFilterLabel}
        onClose={closeDetails}
      />
    </Card>
  );
}
