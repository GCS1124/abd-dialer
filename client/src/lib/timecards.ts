import type { EmployeeTimecardSummary, TimecardSnapshot } from "../types";

function normalizeSeconds(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export function formatTimecardDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600).toString();
  const minutes = Math.floor((safeSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(safeSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${hours}:${minutes}:${seconds}`;
}

export function createEmptyTimecardSummary(): EmployeeTimecardSummary {
  return {
    trackedDays: 0,
    totalTimeOnSystemSeconds: 0,
    totalBreakSeconds: 0,
    totalWrapSeconds: 0,
    totalLoginHoursSeconds: 0,
    averageTimeOnSystemSeconds: 0,
    averageBreakSeconds: 0,
    averageWrapSeconds: 0,
    averageLoginHoursSeconds: 0,
  };
}

export function summarizeTimecards(timecards: TimecardSnapshot[]): EmployeeTimecardSummary {
  if (!timecards.length) {
    return createEmptyTimecardSummary();
  }

  const totals = timecards.reduce(
    (accumulator, timecard) => {
      accumulator.totalTimeOnSystemSeconds += normalizeSeconds(timecard.timeOnSystemSeconds);
      accumulator.totalBreakSeconds += normalizeSeconds(timecard.breakSeconds);
      accumulator.totalWrapSeconds += normalizeSeconds(timecard.wrapSeconds);
      accumulator.totalLoginHoursSeconds += normalizeSeconds(timecard.loginHoursSeconds);
      return accumulator;
    },
    {
      totalTimeOnSystemSeconds: 0,
      totalBreakSeconds: 0,
      totalWrapSeconds: 0,
      totalLoginHoursSeconds: 0,
    },
  );

  const trackedDays = timecards.length;

  return {
    trackedDays,
    ...totals,
    averageTimeOnSystemSeconds: Math.round(totals.totalTimeOnSystemSeconds / trackedDays),
    averageBreakSeconds: Math.round(totals.totalBreakSeconds / trackedDays),
    averageWrapSeconds: Math.round(totals.totalWrapSeconds / trackedDays),
    averageLoginHoursSeconds: Math.round(totals.totalLoginHoursSeconds / trackedDays),
  };
}

export function summarizeTimecard(timecard: TimecardSnapshot | null | undefined) {
  return timecard ? summarizeTimecards([timecard]) : createEmptyTimecardSummary();
}
